export function LogoutButton() {
  return (
    <form action="/auth/logout" method="post">
      <button type="submit">Sign out</button>
    </form>
  );
}
