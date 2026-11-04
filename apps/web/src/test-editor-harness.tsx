import { useState } from "react";
import { CvEditor } from "./App";
import { MemoryBaseCvAdapter } from "./base/adapter";
import type { Locale } from "./base/model";
// Field/save regressions exercise the editor independently of the resource shell.
// Shell navigation and recovery have their own journey suite.
const memory = new MemoryBaseCvAdapter();
const keys = new WeakMap<object, number>();
let nextKey = 0;
export function App(
  props: Omit<
    Parameters<typeof CvEditor>[0],
    "uiLocale" | "onUiLocaleChange" | "adapter"
  > & { adapter?: Parameters<typeof CvEditor>[0]["adapter"] },
) {
  const [locale, setLocale] = useState<Locale>("ro");
  const adapter = props.adapter ?? memory;
  if (!keys.has(adapter)) keys.set(adapter, ++nextKey);
  return (
    <CvEditor
      key={keys.get(adapter)}
      {...props}
      adapter={props.adapter ?? memory}
      uiLocale={locale}
      onUiLocaleChange={setLocale}
    />
  );
}
