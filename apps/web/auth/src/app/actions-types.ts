export interface SignInState {
  email: string;
  error: string | null;
}

export const initialSignInState: SignInState = {
  error: null,
  email: "",
};
