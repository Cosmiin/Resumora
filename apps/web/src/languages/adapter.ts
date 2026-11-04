import { AdapterError } from "../base/adapter";
import { HttpBaseCvAdapter, type CvTransport } from "../base/http-adapter";
export class HttpLanguageCvAdapter extends HttpBaseCvAdapter {
  constructor(
    transport: CvTransport,
    readonly variantId: string,
    readonly documentLocale: string,
  ) {
    super(transport, `/v1/base-cv/languages/${encodeURIComponent(variantId)}`);
  }
  async load() {
    const current = await super.load();
    if (!current) throw new AdapterError("missing");
    return current;
  }
}
