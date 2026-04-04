/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.png" {
  const src: string;
  export default src;
}

declare namespace JSX {
  interface IntrinsicElements {
    "playing-card": import("react").DetailedHTMLProps<
      import("react").HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      cid?: string;
      rank?: string | number;
      suit?: string | number;
      backcolor?: string;
      backtext?: string;
      backtextcolor?: string;
      draggable?: string | boolean;
    };
  }
}
