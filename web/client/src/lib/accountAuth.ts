import { api, type AccountType } from "./api";

export type RegistrationInput = {
  fullName: string;
  email: string;
  password: string;
  accountType: AccountType;
  redirectTo: string;
};

export async function registerWithEmail(input: RegistrationInput) {
  return api.register(input.fullName.trim(), input.email.trim(), input.password, input.accountType);
}

export async function requestPasswordReset(email: string, _redirectTo: string) {
  return api.passwordReset(email.trim());
}
