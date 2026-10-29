import { UNITS_STORAGE_KEY } from "@/lib/units";

/**
 * Applies the visitor's saved unit system to <html data-units> before paint,
 * so a returning visitor never sees the other units flash. With nothing saved
 * the attribute stays off and the page is in the default (metric).
 */
export function UnitsBootScript() {
  const code = `(function(){try{var u=window.localStorage.getItem(${JSON.stringify(UNITS_STORAGE_KEY)});if(u==="metric"||u==="imperial")document.documentElement.setAttribute("data-units",u);}catch(e){}})();`;
  // biome-ignore lint/security/noDangerouslySetInnerHtml: pre-hydration boot script, like ThemeBootScript
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
