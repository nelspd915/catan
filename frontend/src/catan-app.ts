import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";

import "./game-app";

@customElement("catan-app")
export class CatanApp extends LitElement {
  render() {
    return html`<game-app></game-app>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "catan-app": CatanApp;
  }
}
