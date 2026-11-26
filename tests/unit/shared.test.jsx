import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EntryRow, formatDate, money } from "../../src/components/Shared";

describe("money and dates", () => {
  it("formats rupees with Indian digit grouping", () => {
    expect(money(245000)).toBe("₹2,45,000");
  });

  it("formats an ISO date", () => {
    expect(formatDate("2026-05-28")).toBe("28 May 2026");
  });
});

describe("EntryRow", () => {
  it("leads with who was paid and signs the amount", () => {
    render(
      <EntryRow
        entry={{
          entry_type: "expense",
          amount: 1250,
          paid_to: "Test Hardware",
          entry_date: "2026-09-28",
          categories: { name: "Materials" },
        }}
      />,
    );

    expect(screen.getByText("Test Hardware")).toBeInTheDocument();
    expect(screen.getByText("-₹1,250")).toBeInTheDocument();
  });
});
