import { describe, it, expect, vi, afterEach } from "vitest";
import { getBarangaysByCity, PAGADIAN_CITY_CODE } from "../psgc";

describe("getBarangaysByCity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the given city's barangay list and returns the parsed array", async () => {
    const fakeResponse = [
      { name: "Upper Sibatang", code: "0907322050", status: "1024" },
      { name: "Alegria", code: "0907322001", status: "1237" },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => fakeResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getBarangaysByCity(PAGADIAN_CITY_CODE);

    expect(result).toEqual(fakeResponse);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://psgc.cloud/api/cities-municipalities/${PAGADIAN_CITY_CODE}/barangays`,
    );
  });

  it("throws with a clear message on a non-OK HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" }),
    );
    await expect(getBarangaysByCity("bad-code")).rejects.toThrow(/404/);
  });

  it("throws if the response body isn't an array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK", json: async () => ({ not: "an array" }) }),
    );
    await expect(getBarangaysByCity(PAGADIAN_CITY_CODE)).rejects.toThrow(/unexpected shape/);
  });

  it("throws if an entry is missing a name or code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [{ name: "Alegria" /* no code */ }],
      }),
    );
    await expect(getBarangaysByCity(PAGADIAN_CITY_CODE)).rejects.toThrow(/malformed entry/);
  });
});
