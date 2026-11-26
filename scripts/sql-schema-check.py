#!/usr/bin/env python3
"""
Checks SQL migrations against the schema the repository actually builds.

Written because three real defects slipped into this repository the same way:
a migration referenced `profiles.verified`, another referenced `jobs.posted_by`,
and a third called `bsdc.notify_staff()` — none of which exist. Each one is a
runtime failure inside a SECURITY DEFINER function, which means the symptom
appears to a member as "the list is empty" rather than as an error, and the
cause is invisible in review because the SQL looks right.

   python3 scripts/sql-schema-check.py                     # every migration
   python3 scripts/sql-schema-check.py path/to/new.sql ...  # just these files

Exit code 1 when anything is reported. A name that is defined *anywhere* in
the repository counts as defined, because CREATE OR REPLACE and later grants
are legal; the check only reports names nothing defines at all.

Scope is per statement block rather than per file, because the same alias
letter legitimately means different tables in two different function bodies
(`p` is `profiles` in one queue and `ad_credit_purchases` in the next).
Analysing a whole file at once produces false positives, and a checker with
false positives trains you to ignore it.
"""
import collections
import glob
import re
import sys

STOPWORDS = {
    'where', 'on', 'join', 'left', 'right', 'inner', 'outer', 'full', 'cross',
    'group', 'order', 'limit', 'using', 'select', 'union', 'having', 'as', 'and',
    'or', 'not', 'set', 'values', 'return', 'returns', 'then', 'else', 'when',
    'from', 'into', 'update', 'delete', 'insert', 'conflict', 'do', 'nothing',
}

# Words that follow a table name in SQL but are never aliases.
RESERVED_ALIAS_WORDS = {
    'where', 'on', 'join', 'left', 'right', 'inner', 'outer', 'full', 'cross',
    'group', 'order', 'limit', 'union', 'having', 'using', 'set', 'returning',
    'select', 'values', 'and', 'or', 'not', 'as', 'for', 'with', 'do',
}

RESERVED_FIRST_WORDS = {
    'constraint', 'primary', 'unique', 'check', 'foreign', 'references',
}


def read(path):
    with open(path, encoding='utf-8') as handle:
        return handle.read()


def all_sources(exclude):
    """Every migration except the files under test."""
    files = sorted(glob.glob('supabase/migrations/*.sql'))
    return '\n'.join(read(f) for f in files if f not in exclude)


def columns_of(body):
    """Column names declared in the first position of a CREATE TABLE body."""
    found = set()
    for line in body.split('\n'):
        # `"position" integer` is the same column as `position integer`.
        match = re.match(r'\s*"?([a-z_][a-z0-9_]*)"?\s+[a-z]', line, re.I)
        if match and match.group(1).lower() not in RESERVED_FIRST_WORDS:
            found.add(match.group(1).lower())
    return found


VIEW_RE = re.compile(
    r'create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+'
    r'([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s+as\s+select(.*?)\bfrom\b',
    re.I | re.S,
)


def view_columns(src):
    """
    {view: {columns}} from the aliased output list of each view definition.

    A view is a relation, and a later migration reading one is exactly the kind of
    reference this tool exists to check: `select r.surface from bsdc.media_references`
    is as capable of being wrong as `select c.surface from comments`. Without this the
    only way to satisfy the check was to not use a view, which is a rule the schema
    never had.

    Only columns given an explicit `as` name are collected. A view written as a bare
    `select a, b` gets nothing recorded, and references to it are then left unchecked
    rather than guessed at -- a checker that reports a real query as broken trains you
    to run it with the new file on the excluded list.
    """
    out = collections.defaultdict(set)
    for match in VIEW_RE.finditer(src):
        aliases = set(re.findall(r'\bas\s+([a-z_][a-z0-9_]*)\b', match.group(2), re.I))
        if aliases:
            out[match.group(1).lower()] |= aliases
    return out


def statement_body(src, open_index):
    """
    The text between the parenthesis at `open_index` and its matching close.

    Parenthesis counting rather than a lazy regex, because a table body holds
    CHECK constraints, enum lists, and nested function calls, and a lazy `.*?`
    stops at the first `);` — which silently drops every column after a
    constraint and makes a real column look undefined.
    """
    depth = 0
    for index in range(open_index, len(src)):
        char = src[index]
        if char == '(':
            depth += 1
        elif char == ')':
            depth -= 1
            if depth == 0:
                return src[open_index + 1:index]
    return src[open_index + 1:]


def table_columns(src):
    """{table: {columns}} for CREATE TABLE and ADD COLUMN in a chunk of SQL."""
    # Comments are stripped first, because a `;` inside one ends the ALTER TABLE
    # match below. A real migration here had the sentence "Every rule gets a
    # review date; the date is not advisory" between the ALTER and its clauses,
    # which silently dropped every column after it from the vocabulary and made
    # the file's own correct references read as missing columns.
    src = re.sub(r'--[^\n]*', '', src)
    out = collections.defaultdict(set)
    for match in re.finditer(
        r'create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s*\(',
        src, re.I,
    ):
        body = statement_body(src, match.end() - 1)
        out[match.group(1)] |= columns_of(body)
    # One ALTER TABLE may carry several comma-separated ADD COLUMN clauses, so
    # each statement is scanned for every `add column` it contains.
    for match in re.finditer(r'alter\s+table\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)([^;]*);', src, re.I | re.S):
        table, clauses = match.group(1), match.group(2)
        for clause in re.finditer(
            r'add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)', clauses, re.I
        ):
            out[table].add(clause.group(1).lower())
    return out


def vocabulary(src):
    """Every name the repository defines, in the broadest legal sense."""
    kinds = set()
    for match in re.finditer(r'bsdc_notification_kind\s+as\s+enum\s*\((.*?)\)', src, re.I | re.S):
        kinds |= set(re.findall(r"'([a-z_]+)'", match.group(1)))
    for match in re.finditer(r"add\s+value\s+'([a-z_]+)'", src, re.I):
        kinds.add(match.group(1))
    for match in re.finditer(r'v_labels constant text\[\] := array\[(.*?)\]', src, re.I | re.S):
        kinds |= set(re.findall(r"'([a-z_]+)'", match.group(1)))
    views = view_columns(src)
    return {
        'tables': set(re.findall(
            r'create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)', src, re.I))
            | set(views),
        'columns': {**table_columns(src), **views},
        'functions': set(re.findall(
            r'create\s+(?:or\s+replace\s+)?function\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s*\(', src, re.I)),
        'types': set(re.findall(r'create\s+type\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)', src, re.I)),
        'kinds': kinds,
    }


def blocks_of(code):
    """One chunk per statement or function body, so aliases stay local."""
    return re.split(r'\$\$\s*;', code)


def check(path, vocab, problems):
    code = re.sub(r'--[^\n]*', '', read(path))
    own_views = view_columns(code)
    own_columns = {**table_columns(code), **own_views}
    own_tables = set(re.findall(
        r'create\s+table\s+(?:if\s+not\s+exists\s+)?((?:public|bsdc)\.[a-z_][a-z0-9_]*)', code, re.I)) \
        | set(own_views)
    own_functions = set(re.findall(
        r'create\s+(?:or\s+replace\s+)?function\s+((?:public|bsdc)\.[a-z_][a-z0-9_]*)\s*\(', code, re.I))

    def columns_for(table):
        # Union rather than `or`: a table defined by an earlier migration and
        # extended by this one must offer both sets of columns. Preferring the
        # corpus silently discarded every column the file under test adds.
        return (vocab['columns'].get(table) or set()) | (own_columns.get(table) or set())

    for block in blocks_of(code):
        if not block.strip():
            continue

        # A `returns table (...)` clause declares output columns that are legal
        # to reference as bare or aliased names throughout the body. They are
        # not table columns, so they must not be read as missing columns of the
        # query alias that happens to share a letter.
        output_columns = set()
        for match in re.finditer(r'returns\s+table\s*\(', block, re.I):
            depth, index = 0, match.end() - 1
            while index < len(block):
                if block[index] == '(':
                    depth += 1
                elif block[index] == ')':
                    depth -= 1
                    if depth == 0:
                        break
                index += 1
            for declaration in block[match.end():index].split(','):
                name = re.match(r'\s*([a-z_][a-z0-9_]*)', declaration, re.I)
                if name:
                    output_columns.add(name.group(1).lower())

        # String literals are data, not schema: `'notices.publish'` is a
        # permission key and `'profile_media'` is a relname compared at runtime.
        # Blanking them here is what stops those from reading as column access.
        scan = re.sub(r"'(?:[^']|'')*'", "''", block)

        # 1. Tables that must exist.
        for match in re.finditer(
            r'\b(?:from|join|into|update|table)\s+((?:public|bsdc)\.[a-z_][a-z0-9_]*)', scan, re.I
        ):
            table = match.group(1)
            # `from public.set_returning_function(...)` reads a table-valued
            # function, not a table.
            if re.match(r'\s*\(', scan[match.end(1):]):
                continue
            if table not in vocab['tables'] and table not in own_tables:
                problems.add(f'{path}: unknown table {table}')

        # 2. Functions that must exist.
        for match in re.finditer(r'(?<![.\w"])((?:public|bsdc)\.[a-z_0-9]+)\s*\(', scan):
            name = match.group(1)
            # `create index ... on public.table (column)` names an index target,
            # which reads exactly like a call but is not one.
            if re.search(r'\bon\s+$', scan[max(0, match.start() - 12):match.start()], re.I):
                continue
            if name in own_tables or name in vocab['tables']:
                continue
            if name in vocab['functions'] or name in vocab['types'] or name in own_functions:
                continue
            problems.add(f'{path}: unknown function {name}')

        # 3. Notification kinds that must be in the enum.
        for match in re.finditer(r"'([a-z_]+)'::(?:bsdc\.)?bsdc_notification_kind", block):
            if match.group(1) not in vocab['kinds']:
                problems.add(f'{path}: notification kind {match.group(1)!r} is not in the enum')

        # 4. `v_x public.table%rowtype` records carry that table's columns, so
        #    `v_job.posted_by` is the same defect as `jobs.posted_by`.
        for match in re.finditer(
            r'([a-z_][a-z0-9_]*)\s+((?:public|bsdc)\.[a-z_][a-z0-9_]*)%rowtype', scan, re.I
        ):
            record, table = match.group(1).lower(), match.group(2)
            columns = columns_for(table)
            if not columns:
                continue
            for inner in re.finditer(r'\b%s\.([a-z_][a-z0-9_]*)' % re.escape(record), block, re.I):
                if inner.group(1).lower() not in columns:
                    problems.add(
                        f'{path}: {table}.{inner.group(1)} is not a column (via record {record})')

        # 5. Query aliases, resolved positionally.
        #
        # A function body can contain several SELECTs, and the same letter may
        # legally mean `courses` in one and `certificates` in the next. Picking
        # one meaning per block made `c.code` look like a missing column on
        # `courses` when it was a real column on `certificates`. So each alias
        # use is bound to the nearest FROM/JOIN declaration that precedes it,
        # and only within the same statement.
        # CTE names created by `with x as (...)` / `, y as (...)`.
        cte_names = set()
        for match in re.finditer(r'(?:\bwith|,)\s*([a-z_][a-z0-9_]*)\s+as\s*(?:materialized\s*)?\(',
                                 scan, re.I):
            cte_names.add(match.group(1).lower())

        declarations = []
        for match in re.finditer(
            r'(?<![\w.])(?:from|join)\s+((?:public|bsdc)\.[a-z_][a-z0-9_]*)'
            r'(?:\s+(?:as\s+)?([a-z][a-z0-9_]*)\b)?',
            scan, re.I,
        ):
            # `returns table (id uuid, ...)` names columns, not a table to read.
            if re.search(r'returns\s+table\s*\($', scan[:match.start()], re.I):
                continue
            table = match.group(1)
            alias = (match.group(2) or '').lower()
            # `from public.post_media (media_id)` is not an alias: a `(` after a
            # table name is a column list on an INSERT or an index expression.
            # `from public.gigs where ...` would otherwise capture `where` as
            # an alias, and every real alias in that statement then went
            # unbound -- which made `p.verified` invisible to the check.
            if not alias or alias in STOPWORDS or alias in RESERVED_ALIAS_WORDS:
                alias = ''
            names = {table.split('.')[-1]: table}
            if alias and alias not in STOPWORDS:
                names[alias] = table
            declarations.append((match.start(), names))

        if declarations:
            # Ambiguity is the normal case, not the exception: `p` is `posts` in
            # one subquery and `profiles` in the outer one, inside a single
            # function body, and PL/pgSQL has no `;` between them because a
            # nested SELECT is an expression. Resolving that properly means
            # nesting-aware parsing, which this tool is not.
            #
            # So a use is only checked when exactly ONE in-scope declaration
            # could provide the column. If any candidate table has the column,
            # the reference is plausible and is left alone. That trades some
            # sensitivity for zero false positives, which is the right trade
            # for a check that has to stay on in CI.
            for use in re.finditer(r'\b([a-z][a-z0-9_]*)\.([a-z_][a-z0-9_]*)', scan, re.I):
                alias, column = use.group(1).lower(), use.group(2)
                if alias in STOPWORDS or alias in ('new', 'old', 'pg_class', 'pg_namespace'):
                    continue

                candidates = []
                for position, names in declarations:
                    if alias in names and names[alias] not in candidates:
                        candidates.append(names[alias])
                if not candidates:
                    continue

                # A CTE (`with x as (...)` then `from x`) is a query, not a
                # table: its columns come from its own select list, which this
                # tool does not model. If any candidate for this alias is a CTE
                # name, the reference is unprovable and is left alone.
                if any(t.split('.')[-1] in cte_names for t in candidates):
                    continue

                # A RETURNS TABLE output column is a name this function owns, so
                # `c.lastmod` where `lastmod` is declared in the return list is
                # not a column lookup on `courses`.
                if column.lower() in output_columns:
                    continue

                # Report only when no candidate table has the column at all.
                if any(column.lower() in (columns_for(t) or set()) for t in candidates):
                    continue
                problems.add(
                    f'{path}: {column} is not a column of {" or ".join(sorted(candidates))} '
                    f'(via alias {alias})')


def main(paths):
    if not paths:
        paths = sorted(glob.glob('supabase/migrations/*.sql'))
    # The vocabulary is the union of every migration, always. A file's own
    # definitions are also collected separately as "local", so checking a whole
    # directory is the same test as checking one new file against the rest.
    vocab = vocabulary(all_sources(set()))
    problems = set()
    for path in paths:
        check(path, vocab, problems)
    for problem in sorted(problems):
        print(f'PROBLEM {problem}')
    print(f'{len(problems)} problem(s) across {len(paths)} file(s)')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
