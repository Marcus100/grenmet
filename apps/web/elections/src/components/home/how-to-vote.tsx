const PEO_REGISTRATION = "https://www.peogrenada.org/Registration";

/**
 * Registration facts quoted from the Parliamentary Elections Office's own
 * page, with a link. Nothing here is our interpretation.
 */
export function HowToVote() {
  return (
    <div>
      <ul className="space-y-2 text-sm">
        <li>
          <b>You must be registered to vote.</b> Registration takes place only
          at your constituency office.
        </li>
        <li>
          <b>Register before the election writ is issued.</b> The PEO says
          registration closes when the Governor General issues the writ for a
          general election. Check with your constituency office for current
          arrangements.
        </li>
        <li>
          <b>Bring:</b> an official birth certificate or valid passport; a
          marriage certificate where applicable; citizenship documents; proof of
          stay in Grenada for Commonwealth citizens; and, for naturalised
          Grenadians, a Grenadian parent’s birth certificate.
        </li>
        <li>
          <b>Your Voter’s ID card</b> takes about two weeks. Registering is
          free; a replacement card costs EC$20. Only you can collect your card,
          with the receipt you were given at registration.
        </li>
      </ul>
      <p className="mt-3 text-el-muted text-xs">
        Source:{" "}
        <a
          className="underline underline-offset-2"
          href={PEO_REGISTRATION}
          rel="noopener"
          target="_blank"
        >
          Parliamentary Elections Office, Registration
        </a>
        . For anything else, contact the Parliamentary Elections Office.
      </p>
    </div>
  );
}
