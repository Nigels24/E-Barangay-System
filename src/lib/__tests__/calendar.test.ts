import { describe, it, expect } from "vitest";
import {
  EARLIEST_SELECTABLE_YEAR,
  MONTHS,
  formatPeriodLabel,
  isWithinPeriod,
  monthLabel,
  periodDatePrefix,
  periodEndDate,
  periodStartDate,
  selectableYears,
} from "../calendar";

describe("MONTHS", () => {
  it("is the twelve calendar months, numbered the way the database numbers them", () => {
    expect(MONTHS).toHaveLength(12);
    expect(MONTHS.map((m) => m.value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(MONTHS[0].label).toBe("January");
    expect(MONTHS[11].label).toBe("December");
  });
});

describe("selectableYears", () => {
  it("runs from next year back to the earliest year, newest first", () => {
    const years = selectableYears(new Date("2026-08-13T00:00:00Z"));
    expect(years[0]).toBe(2027);
    expect(years.at(-1)).toBe(EARLIEST_SELECTABLE_YEAR);
    expect(years).toContain(2026);
  });

  it("offers a year ahead of the calendar year — the client works ahead", () => {
    // Not a fixed list: `ensurePeriod` opens whatever is chosen, and the
    // schema's only guard is a 1900-2200 sanity range.
    expect(selectableYears(new Date("2030-01-01T00:00:00Z"))[0]).toBe(2031);
  });

  it("is strictly descending with no duplicates", () => {
    const years = selectableYears(new Date("2026-08-13T00:00:00Z"));
    for (let i = 1; i < years.length; i++) expect(years[i]).toBe(years[i - 1] - 1);
    expect(new Set(years).size).toBe(years.length);
  });

  it("reaches back to 2000, where the client's Schedule of Advances starts", () => {
    expect(selectableYears(new Date("2026-08-13T00:00:00Z"))).toContain(2000);
  });
});

describe("monthLabel", () => {
  it("names a month", () => {
    expect(monthLabel(1)).toBe("January");
    expect(monthLabel(12)).toBe("December");
  });

  it("throws rather than rendering `undefined` for a month outside 1-12", () => {
    expect(() => monthLabel(0)).toThrow(RangeError);
    expect(() => monthLabel(13)).toThrow(RangeError);
  });
});

describe("formatPeriodLabel", () => {
  it("writes a period the way a report header does", () => {
    expect(formatPeriodLabel(2023, 12)).toBe("December 2023");
  });
});

describe("periodStartDate / periodEndDate", () => {
  it("brackets a 31-day month", () => {
    expect(periodStartDate(2023, 12)).toBe("2023-12-01");
    expect(periodEndDate(2023, 12)).toBe("2023-12-31");
  });

  it("pads a single-digit month, so the string still sorts", () => {
    expect(periodStartDate(2024, 1)).toBe("2024-01-01");
    expect(periodEndDate(2024, 4)).toBe("2024-04-30");
  });

  it("gets February right in a leap year, a common year, and a century", () => {
    expect(periodEndDate(2024, 2)).toBe("2024-02-29");
    expect(periodEndDate(2023, 2)).toBe("2023-02-28");
    expect(periodEndDate(1900, 2)).toBe("1900-02-28");
    expect(periodEndDate(2000, 2)).toBe("2000-02-29");
  });

  it("refuses a month that is not a month", () => {
    expect(() => periodStartDate(2023, 0)).toThrow(RangeError);
    expect(() => periodEndDate(2023, 13)).toThrow(RangeError);
  });
});

describe("isWithinPeriod", () => {
  it("accepts the first and last day of the period", () => {
    expect(isWithinPeriod("2023-12-01", 2023, 12)).toBe(true);
    expect(isWithinPeriod("2023-12-31", 2023, 12)).toBe(true);
  });

  it("rejects the neighbouring months and the same month a year out", () => {
    expect(isWithinPeriod("2023-11-30", 2023, 12)).toBe(false);
    expect(isWithinPeriod("2024-01-01", 2023, 12)).toBe(false);
    expect(isWithinPeriod("2022-12-15", 2023, 12)).toBe(false);
  });

  it("is not fooled by a month whose number is a prefix of another", () => {
    // Without the trailing "-" in the prefix, December would swallow January.
    expect(isWithinPeriod("2023-12-05", 2023, 1)).toBe(false);
    expect(periodDatePrefix(2023, 1)).toBe("2023-01");
  });

  it("rejects an empty or malformed date rather than passing it through", () => {
    expect(isWithinPeriod("", 2023, 12)).toBe(false);
    expect(isWithinPeriod("not a date", 2023, 12)).toBe(false);
  });
});
