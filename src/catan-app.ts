import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * Catan App
 */
@customElement("catan-app")
export class CatanApp extends LitElement {
  render() {
    return html`<h1>Catan: hello world!</h1>`;
  }

  static styles = css``;
}

declare global {
  interface HTMLElementTagNameMap {
    "catan-app": CatanApp;
  }
}
