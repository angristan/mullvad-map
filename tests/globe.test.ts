import { describe, expect, it } from "vitest";
import { isOnVisibleHemisphere } from "../src/lib/globe";

const location = (longitude: number, latitude: number) => ({ longitude, latitude });

describe("isOnVisibleHemisphere", () => {
  it("shows front-facing locations and hides rear locations", () => {
    const center = { lng: 10, lat: 20 };

    expect(isOnVisibleHemisphere(location(15, 25), center)).toBe(true);
    expect(isOnVisibleHemisphere(location(-170, -20), center)).toBe(false);
  });
});
