/**
 * The "add a user" form's rules, as pure functions — same reasoning as
 * `signatoryForm.ts`: there is no React testing library in this project, so
 * anything worth being wrong about belongs here, under vitest, not inside
 * the component.
 */
import type { UserRole } from "../db/schema";
import type { NewUserInput } from "./queries/users";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrator",
  bookkeeper: "Bookkeeper",
  reviewer: "Reviewer",
};

export function userRoleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}

export const USER_ROLE_OPTIONS: { value: UserRole; label: string }[] = (
  ["admin", "bookkeeper", "reviewer"] as const
).map((role) => ({ value: role, label: ROLE_LABELS[role] }));

export interface UserFormState {
  username: string;
  fullName: string;
  position: string;
  role: UserRole;
}

export function emptyUserForm(): UserFormState {
  return { username: "", fullName: "", position: "", role: "bookkeeper" };
}

export function userFormProblems(form: UserFormState, existingUsernames: readonly string[]): string[] {
  const problems: string[] = [];
  if (form.username.trim() === "") problems.push("Give the user a username.");
  else if (existingUsernames.includes(form.username.trim())) problems.push("That username is already taken.");
  if (form.fullName.trim() === "") problems.push("Give the user's full name.");
  return problems;
}

export function toNewUserInput(form: UserFormState): NewUserInput {
  return {
    username: form.username.trim(),
    fullName: form.fullName.trim(),
    position: form.position.trim() || undefined,
    role: form.role,
  };
}
