import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * Catan App
 *
 * This is the main application component for the Catan game. It serves as the entry point for the application and will contain the overall layout and structure of the game interface.
 */
@customElement("catan-app")
export class CatanApp extends LitElement {
  /**
   * Render HTML for the Catan App component. Returns an HTML template string that Lit uses to render the component's content.
   */
  render() {
    return html`<h1>Catan: hello world!</h1>`;
  }

  /**
   * Define CSS styles for the Catan App component. This static property returns a CSS template string that Lit uses to apply styles to the component.
   */
  static styles = css``;
}

/**
 * Global declaration to extend the HTMLElementTagNameMap interface. This allows TypeScript to recognize the "catan-app" custom element and associate it with the CatanApp class, enabling type checking and autocompletion for this custom element in the codebase.
 */
declare global {
  interface HTMLElementTagNameMap {
    "catan-app": CatanApp;
  }
}
