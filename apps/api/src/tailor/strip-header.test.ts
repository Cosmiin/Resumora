import { describe, expect, it } from "vitest";
import { emptyCv } from "@resumora/shared";
import { restoreHeader, stripHeader } from "./strip-header.ts";

describe("CV header", () => {
  it("removes contact details and names while preserving titles, summary and content", () => {
    const original = emptyCv();
    original.basics = {
      fullName: "Ada Lovelace", firstName: "Ada", lastName: "Lovelace",
      email: "ada@example.test", phone: "+40 123456789", location: "Private address",
      website: "https://ada.example.test", linkedin: "https://linkedin.com/in/ada",
      titles: ["Software Engineer"], summary: "Builds useful software.",
    };
    const before = structuredClone(original);
    const { cv, header } = stripHeader(original);
    expect(cv.basics).toEqual({
      fullName: "", firstName: "", lastName: "", email: "", phone: "", location: "",
      website: "", linkedin: "", titles: ["Software Engineer"], summary: "Builds useful software.",
    });
    expect(header).toEqual(before.basics);
    expect(original).toEqual(before);
    expect(restoreHeader(cv, header)).toEqual(before);

    cv.basics.titles = ["Senior Software Engineer"];
    cv.basics.summary = "Updated summary.";
    const restored = restoreHeader(cv, header);
    expect(restored.basics).toEqual({ ...header, titles: ["Senior Software Engineer"], summary: "Updated summary." });
    expect(cv.basics.fullName).toBe("");
    expect(original).toEqual(before);
  });

  it("never passes the photo to the AI copy, and restores it afterwards", () => {
    const original = emptyCv();
    original.basics.photo = { path: "user-1/photo.jpg", x: 50, y: 40, zoom: 1.5 };
    const before = structuredClone(original);
    const { cv, header } = stripHeader(original);
    expect("photo" in cv.basics).toBe(false);
    expect(JSON.stringify(cv)).not.toContain("user-1/photo.jpg");
    expect(restoreHeader(cv, header).basics.photo).toEqual(before.basics.photo);
    expect(original).toEqual(before);
  });
});
