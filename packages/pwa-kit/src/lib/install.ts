export type InstallAdvice = "installed" | "prompt" | "ios-steps" | "menu";

/**
 * How this phone installs the app. Android Chrome can show its own Install
 * prompt; iPhone has no prompt, so the steps are spelled out.
 */
export function installAdvice(state: {
  standalone: boolean;
  ios: boolean;
  canPrompt: boolean;
}): InstallAdvice {
  if (state.standalone) {
    return "installed";
  }
  if (state.canPrompt) {
    return "prompt";
  }
  return state.ios ? "ios-steps" : "menu";
}

const IOS_DEVICE = /iphone|ipad|ipod/iu;
const MAC = /macintosh/iu;

export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  // iPadOS reports itself as a Mac; a Mac with a touch screen is an iPad.
  return (
    IOS_DEVICE.test(userAgent) || (MAC.test(userAgent) && maxTouchPoints > 1)
  );
}
