export interface SignInState {
  email: string;
  error: string | null;
  // What the form should offer next: the authenticator step, or a link to
  // finish email verification.
  next: "mfa" | "verify" | null;
}

export const initialSignInState: SignInState = {
  error: null,
  email: "",
  next: null,
};

export interface ForgotPasswordState {
  email: string;
  error: string | null;
  success: boolean;
}

export const initialForgotPasswordState: ForgotPasswordState = {
  email: "",
  error: null,
  success: false,
};

export interface ResetPasswordState {
  error: string | null;
  success: boolean;
}

export const initialResetPasswordState: ResetPasswordState = {
  error: null,
  success: false,
};

export interface SignUpState {
  email: string;
  error: string | null;
  success: boolean;
}

export const initialSignUpState: SignUpState = {
  email: "",
  error: null,
  success: false,
};
