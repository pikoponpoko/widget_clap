import { describe, expect, it } from "vitest";
import { parseClapDays } from "../src/clap-days-parse";

const nav = (newer: string, older: string) =>
  `<tr><td colspan="14"><a href="analysis.html?p=n">&lt;&lt; ${newer}</a> <b>最新14日間へ</b> <a href="analysis.html?p=o">${older} &gt;&gt;</a></td></tr>`;
// One row of counts and one row of dates, as on the analysis page.
function rows(days: [string, number, number][], newer: string, older: string) {
  return `<section data-page="x"><table><tr><th colspan="14">過去ログ</th></tr>
<tr>${days.map(() => "<td></td>").join("")}</tr>
<tr>${days.map(([, c, v]) => `<td>${c}<br>${v}</td>`).join("")}</tr>
<tr>${days.map(([d]) => `<td>${d}<br><a href="analysis.html?x=1">解析</a></td>`).join("")}</tr>
${nav(newer, older)}</table></section>`;
}
const wrap = (s: string) =>
  `<meta charset="utf-8"><div data-hakushu="webclap-claps" data-today="2026-11-01">${s}</div>`;

describe("parseClapDays", () => {
  it("reads counts and dates in separate rows", () => {
    const days = parseClapDays(
      wrap(
        rows(
          [
            ["11/01", 9, 9],
            ["10/31", 3, 3],
            ["10/29", 9, 7],
          ],
          "2026年11月上旬",
          "2026年10月下旬",
        ),
      ),
    );
    expect(days).toEqual([
      { day: "2026-11-01", claps: 9, visitors: 9 },
      { day: "2026-10-31", claps: 3, visitors: 3 },
      { day: "2026-10-29", claps: 9, visitors: 7 },
    ]);
  });
  it("steps back a year across January", () => {
    const days = parseClapDays(
      wrap(
        rows(
          [
            ["01/02", 1, 1],
            ["01/01", 2, 2],
            ["12/31", 0, 0],
            ["12/30", 4, 3],
          ],
          "2020年1月中旬",
          "2019年12月下旬",
        ),
      ),
    );
    expect(days.map((d) => d.day)).toEqual([
      "2020-01-02",
      "2020-01-01",
      "2019-12-31",
      "2019-12-30",
    ]);
  });
  it("reads one cell per day and keeps the newer page for repeated days", () => {
    const cell = (d: string, c: number, v: number) =>
      `<td><div>${c}</div><div>${v}</div><div>${d} <a href="a?date=2015${d.replace("/", "")}">解析</a></div></td>`;
    const page = (cells: string, newer: string) =>
      `<section data-page="y"><table><tr><td>過去ログ</td></tr><tr>${cells}</tr><tr><td><a href="n">&lt;&lt; ${newer}</a></td></tr></table></section>`;
    const days = parseClapDays(
      wrap(
        page(cell("03/02", 5, 4) + cell("03/01", 2, 1), "2015年3月上旬") +
          page(cell("03/01", 7, 7) + cell("02/28", 1, 1), "2015年3月上旬"),
      ),
    );
    expect(days).toEqual([
      { day: "2015-03-02", claps: 5, visitors: 4 },
      { day: "2015-03-01", claps: 2, visitors: 1 },
      { day: "2015-02-28", claps: 1, visitors: 1 },
    ]);
  });
  it("uses the older link when there is no newer one", () => {
    const html = `<section><table><tr><td>過去ログ</td></tr><tr><td>3</td><td>1</td></tr><tr><td>2</td><td>1</td></tr><tr><td>01/01</td><td>12/31</td></tr><tr><td><a href="o">2009年12月下旬 &gt;&gt;</a></td></tr></table></section>`;
    expect(parseClapDays(wrap(html)).map((d) => d.day)).toEqual([
      "2010-01-01",
      "2009-12-31",
    ]);
  });
});
