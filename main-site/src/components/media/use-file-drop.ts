// The DOM's DragEvent, not React's: these listeners sit on the window.
import { useEffect, useRef, useState } from 'react';

export interface FileDropOptions {
  /** Called with the files a member dropped or pasted. */
  onFiles: (files: File[]) => void;
  /** Only these mime prefixes are taken. Defaults to pictures. */
  accept?: string[];
  /** Turn the whole thing off — an edit page with its own drop target, for instance. */
  disabled?: boolean;
}

/** The kinds a paste or a drop is allowed to carry. */
const DEFAULT_ACCEPT = ['image/'];

function filesFromTransfer(list: DataTransfer | null, accept: string[]): File[] {
  if (!list) return [];
  const taken: File[] = [];
  for (const item of Array.from(list.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file && accept.some((prefix) => file.type.startsWith(prefix))) taken.push(file);
  }
  if (taken.length > 0) return taken;
  // Safari on iOS gives files without items on a drop.
  return Array.from(list.files ?? []).filter((file) =>
    accept.some((prefix) => file.type.startsWith(prefix)),
  );
}

/**
 * Take pictures from a drag, a drop or the clipboard.
 *
 * Attaching a picture by clicking a button and then finding it in a file
 * manager is the slowest route to the same result, and on a phone it is often
 * not a route at all — a screenshot lives in the clipboard, not in a folder.
 * This listens on the window, so the whole composer is the target, and reports
 * the drag so the page can say "let go to attach".
 */
export function useFileDrop({
  onFiles,
  accept = DEFAULT_ACCEPT,
  disabled = false,
}: FileDropOptions) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const handler = useRef(onFiles);
  handler.current = onFiles;

  useEffect(() => {
    if (disabled || typeof window === 'undefined') return;

    function onDragEnter(event: globalThis.DragEvent) {
      if (!event.dataTransfer?.types.includes('Files')) return;
      depth.current += 1;
      setDragging(true);
    }
    function onDragOver(event: globalThis.DragEvent) {
      if (!event.dataTransfer?.types.includes('Files')) return;
      // Without this the browser keeps the drop for itself and opens the file.
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      depth.current += 1;
      setDragging(true);
    }
    function onDragLeave() {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    }
    function onDrop(event: globalThis.DragEvent) {
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = filesFromTransfer(event.dataTransfer, accept);
      if (files.length > 0) handler.current(files);
    }
    function onPaste(event: ClipboardEvent) {
      const files = filesFromTransfer(event.clipboardData, accept);
      if (files.length === 0) return;
      // A pasted picture is an attachment, not text: stop it reaching the field.
      event.preventDefault();
      handler.current(files);
    }

    window.addEventListener('dragenter', onDragEnter as EventListener);
    window.addEventListener('dragover', onDragOver as EventListener);
    window.addEventListener('dragleave', onDragLeave as EventListener);
    window.addEventListener('drop', onDrop as EventListener);
    window.addEventListener('paste', onPaste as EventListener);
    return () => {
      window.removeEventListener('dragenter', onDragEnter as EventListener);
      window.removeEventListener('dragover', onDragOver as EventListener);
      window.removeEventListener('dragleave', onDragLeave as EventListener);
      window.removeEventListener('drop', onDrop as EventListener);
      window.removeEventListener('paste', onPaste as EventListener);
    };
    // `accept` is a literal at every call site; re-binding on its identity
    // would only churn the listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  return { dragging, acceptFiles: (list: DataTransfer | null) => filesFromTransfer(list, accept) };
}
