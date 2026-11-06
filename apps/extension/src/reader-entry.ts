import { readPage } from "./readers";
import type { ReaderResult } from "./readers";

const readerGlobal = globalThis as typeof globalThis & {
  __resumoraReadPage: () => ReaderResult;
};

readerGlobal.__resumoraReadPage = () => readPage(document, location);
