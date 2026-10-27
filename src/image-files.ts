import { unzipSync } from "fflate";

const types: Record<string, string> = {
  png: "image/png",
  apng: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const hidden = (path: string) =>
  path.split("/").some((part) => part.startsWith(".") || part === "__MACOSX");

async function expand(file: File, path = file.name): Promise<File[]> {
  if (hidden(path)) return [];
  if (ext(path) === "zip") {
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (f) => !hidden(f.name) && ext(f.name) in types,
    });
    return Object.entries(entries).map(
      ([name, bytes]) =>
        new File([bytes as BlobPart], name.split("/").pop()!, {
          type: types[ext(name)],
        }),
    );
  }
  return ext(path) in types ? [file] : [];
}

function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile)
    return new Promise((resolve, reject) =>
      (entry as FileSystemFileEntry).file(
        (f) => expand(f, entry.fullPath).then(resolve, reject),
        reject,
      ),
    );
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length) {
          all.push(...batch);
          next();
        } else
          Promise.all(all.map(readEntry)).then(
            (r) => resolve(r.flat()),
            reject,
          );
      }, reject);
    next();
  });
}

// Images from picked files, dropped files and folders, and zip archives, in name order.
export async function collectImages(
  source: FileList | DataTransfer,
): Promise<File[]> {
  let files: File[];
  if (source instanceof DataTransfer) {
    const entries = Array.from(source.items)
      .map((i) => i.webkitGetAsEntry?.())
      .filter((e): e is FileSystemEntry => !!e);
    files = entries.length
      ? (await Promise.all(entries.map(readEntry))).flat()
      : (
          await Promise.all(Array.from(source.files).map((f) => expand(f)))
        ).flat();
  } else
    files = (
      await Promise.all(
        Array.from(source).map((f) =>
          expand(f, f.webkitRelativePath || f.name),
        ),
      )
    ).flat();
  return files.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}
