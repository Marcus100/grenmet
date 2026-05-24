export interface SignInState {
  email: string;
  error: string | null;
}

export const initialSignInState: SignInState = {
  error: null,
  email: "",
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
