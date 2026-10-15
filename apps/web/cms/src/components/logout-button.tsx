export function LogoutButton() {
  return (
    <>
      <form action="/auth/logout" method="post">
        <button type="submit">Sign out</button>
      </form>
      <form action="/auth/logout-all" method="post">
        <button type="submit">Sign out of all apps</button>
      </form>
    </>
  );
}
