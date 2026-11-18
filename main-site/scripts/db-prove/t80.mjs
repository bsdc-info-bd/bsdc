/**
 * Proof for 0121: a poll that has votes keeps its options.
 *
 * Editing a post used to rewrite its poll by deleting every option and
 * inserting the new list. `poll_votes.option_id` cascades from `poll_options`,
 * so the rewrite deleted every ballot: correcting a typo in a poll's body
 * emptied the poll, and the options came back with new ids, so nothing was
 * recoverable. Three claims are worth a test rather than a paragraph:
 *
 *   1. **A voted option cannot be deleted.** Not by the client's rewrite, not by
 *      a console, not by a future admin tool. An option nobody has voted for is
 *      still editable, because a poll that has no answers is only a draft of
 *      one.
 *
 *   2. **The poll still dies with its post.** A trigger that refuses deletes is
 *      one bad interaction away from making a post impossible to remove, and the
 *      cascade arrives one trigger deeper than a client delete. Both directions
 *      are asserted, because a fix that only tested the first would ship a
 *      database where deleting a post raised an error.
 *
 *   3. **Voting still works.** The guard sits in front of the mechanism members
 *      actually use, so the ballot is cast and counted through the same RPC
 *      afterwards rather than assumed to be unaffected.
 */
import { as, check, expectFail, failureCount, summary } from './lib.mjs';
import { makeDb } from './lib.mjs';

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';

const db = await makeDb();

await db.exec(`
  insert into public.profiles (uid, username, display_name, status) values
    ('${ada}',   'adafirst',    'Ada First',    'active'),
    ('${rahim}', 'rahimsecond', 'Rahim Second', 'active');

  insert into public.posts (author_uid, kind, slug, title, body, status, published_at, visibility)
    values ('${rahim}', 'poll', 'which-editor', 'Which editor should I learn', 'Two days in.',
            'published', now(), 'public');
`);

const postId = (await db.query(`select id from public.posts where slug = 'which-editor'`)).rows[0]
  .id;

// The poll as the composer writes it on first publish: two options, no votes.
await as(
  db,
  rahim,
  `insert into public.poll_options (post_id, "position", label) values
     ('${postId}', 0, 'Neovim'),
     ('${postId}', 1, 'VS Code')`,
  'the author publishes a poll with two options',
);

const options = (
  await db.query(
    `select id, "position", label from public.poll_options where post_id = '${postId}' order by "position"`,
  )
).rows;
check(options.length === 2, 'the poll has two options', String(options.length));
const [neovim, vscode] = options;

// ------------------------------------------------------------- voting works ---

await as(db, ada, `select public.cast_poll_vote('${postId}', '${neovim.id}')`, 'a member votes');
const votes = await db.query(
  `select o.label, o.votes from public.poll_options o where o.post_id = '${postId}' order by o."position"`,
);
check(
  Number(votes.rows[0].votes) === 1,
  'the option carries one vote',
  String(votes.rows[0].votes),
);
check(Number(votes.rows[1].votes) === 0, 'the other option is untouched');

// --------------------------------------------------- an unvoted option moves ---

await as(
  db,
  rahim,
  `delete from public.poll_options where id = '${vscode.id}'`,
  'the author edits an option nobody voted for',
);
check(
  (await db.query(`select 1 from public.poll_options where id = '${vscode.id}'`)).rows.length === 0,
  'an unvoted option is still replaceable',
);

// ---------------------------------------------------------- a voted one does not ---

// This is the exact statement the client used to issue on every save.
await expectFail(
  db,
  rahim,
  `delete from public.poll_options where id = '${neovim.id}'`,
  '23514',
  'an option that carries a ballot cannot be deleted',
);

await expectFail(
  db,
  rahim,
  `delete from public.poll_options where post_id = '${postId}'`,
  '23514',
  'the rewrite that emptied the poll is refused as a whole',
);

const survived = await db.query(
  `select count(*)::int as n from public.poll_options where post_id = '${postId}'`,
);
check(Number(survived.rows[0].n) === 1, 'the voted option is still there after the attempts');
check(
  (await db.query(`select count(*)::int as n from public.poll_votes where post_id = '${postId}'`))
    .rows[0].n === 1,
  'and the ballot is still there with it',
);

// The label is still correctable — a poll keeps its options, not its typos.
await as(
  db,
  rahim,
  `update public.poll_options set label = 'Neovim 0.11' where id = '${neovim.id}'`,
  'the author fixes the wording without losing the vote',
);
check(
  (await db.query(`select label, votes from public.poll_options where id = '${neovim.id}'`)).rows[0]
    .votes === 1,
  'correcting a label keeps its votes',
);

// ------------------------------------------------------- the poll dies with its post ---

const doomed = (
  await db.query(
    `insert into public.posts (author_uid, kind, slug, title, body, status, published_at, visibility)
     values ('${rahim}', 'poll', 'doomed-poll', 'Doomed', 'Goes away.', 'published', now(), 'public')
     returning id`,
  )
).rows[0].id;
await as(
  db,
  rahim,
  `insert into public.poll_options (post_id, "position", label)
   values ('${doomed}', 0, 'Yes'), ('${doomed}', 1, 'No')`,
  'a second poll is published',
);
const doomedOption = (
  await db.query(
    `select id from public.poll_options where post_id = '${doomed}' order by "position"`,
  )
).rows[0].id;
await as(db, ada, `select public.cast_poll_vote('${doomed}', '${doomedOption}')`, 'a member votes');

await as(
  db,
  rahim,
  `delete from public.posts where id = '${doomed}'`,
  'the author deletes a polled post that has votes',
);
check(
  (await db.query(`select count(*)::int as n from public.poll_options where post_id = '${doomed}'`))
    .rows[0].n === 0,
  'deleting the post still takes its options',
);
check(
  (await db.query(`select count(*)::int as n from public.poll_votes where post_id = '${doomed}'`))
    .rows[0].n === 0,
  'deleting the post still takes its votes',
);

summary();
process.exit(failureCount() === 0 ? 0 : 1);
