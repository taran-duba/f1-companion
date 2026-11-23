import { COMPOUND_STYLE } from "@/lib/charts";
import type { StrategyRow } from "./StrategyChart";

/** Screen-reader alternative to the strategy chart: every stint as text. */
export function StrategyTable({ data, totalLaps }: { data: StrategyRow[]; totalLaps: number }) {
  // sr-only goes on a wrapper: a <table> ignores width/overflow clipping and would widen the page.
  return (
    <div className="sr-only">
      <table>
        <caption>Tyre stints per driver, race order, {totalLaps} laps</caption>
        <thead>
          <tr>
            <th scope="col">Position</th>
            <th scope="col">Driver</th>
            <th scope="col">Pit stops</th>
            <th scope="col">Stints</th>
          </tr>
        </thead>
        <tbody>
          {data.map(({ row, spans }) => (
            <tr key={row.num}>
              <td>{row.position < 99 ? row.position : "—"}</td>
              <th scope="row">
                {row.code}
                {row.retired ? " (retired)" : row.stopped ? " (stopped)" : ""}
              </th>
              <td>{Math.max(0, spans.length - 1)}</td>
              <td>
                {spans.length === 0
                  ? "No tyre data"
                  : spans
                      .map((s) => {
                        const name = COMPOUND_STYLE[s.compound].name;
                        const used = s.isNew ? "" : " (used)";
                        const range =
                          s.laps > 0 ? `laps ${s.start} to ${s.end}, ${s.laps} lap${s.laps === 1 ? "" : "s"}` : "no laps yet";
                        return `${name}${used}: ${range}${s.current ? ", current" : ""}`;
                      })
                      .join("; ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
