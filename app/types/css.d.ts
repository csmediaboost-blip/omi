// types/css.d.ts
// This file tells TypeScript that importing .css files is valid
// Place this file at: types/css.d.ts  (create the types/ folder if it doesn't exist)
// This fixes: "Cannot find module or type declarations for side-effect import of './globals.css'"

declare module "*.css" {
  const content: { [className: string]: string };
  export default content;
}

// Also declare global CSS variables if needed
declare module "*.module.css" {
  const classes: { [key: string]: string };
  export default classes;
}
