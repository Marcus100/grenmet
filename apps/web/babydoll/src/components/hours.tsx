import { BUSINESS, HOURS } from "@/data/site";

export function Hours() {
  return (
    <>
      <span className="appt">{BUSINESS.appointmentOnly}</span>
      <table className="hours">
        <caption className="sr-only">Opening hours</caption>
        <tbody>
          {HOURS.map((row) => (
            <tr
              className={"closed" in row ? "closed" : undefined}
              key={row.days}
            >
              <th scope="row">{row.days}</th>
              <td>{row.time}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function Address() {
  return (
    <address>
      {BUSINESS.address.map((line, index) => (
        <span key={line}>
          {index > 0 && <br />}
          {line}
        </span>
      ))}
    </address>
  );
}
