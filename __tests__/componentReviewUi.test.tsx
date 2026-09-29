// @vitest-environment jsdom
// TEST C — the review screen always calculates from the EDITABLE values:
// correcting the 100 XP quantity from 23 to 53 updates the total at once.

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

let suggestion100 = { value: 23 as number | null, confidence: 0.6, alternates: [53] };

vi.mock("@/imageRecognition/tesseractOcr", () => ({ getSharedOcrEngine: () => ({}) }));
vi.mock("@/screenshotParser", () => ({
  createResourceInventoryParser: () => ({
    parse: async () => ({
      screenshotId: "s",
      screenshotType: "enhancement_components",
      overallConfidence: 0.6,
      warnings: [],
      data: {
        pass: "bright-text",
        tokens: [],
        suggestions: [
          { fieldKey: "xp10", value: 59_302, tokenId: null, confidence: 0.95, reason: "10 XP tile", alternates: [], sourceBox: { x: 350, y: 160, width: 225, height: 225 } },
          { fieldKey: "xp100", value: suggestion100.value, tokenId: null, confidence: suggestion100.confidence, reason: "100 XP tile", alternates: suggestion100.alternates, sourceBox: { x: 70, y: 160, width: 225, height: 225 } },
        ],
      },
    }),
  }),
}));

import { ScreenshotImport } from "@/components/ScreenshotImport";

beforeAll(() => {
  (globalThis as any).createImageBitmap = async () => ({ width: 713, height: 481, close() {} });
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => {};
});
afterEach(cleanup);

async function openReview(onConfirm = vi.fn()) {
  render(<ScreenshotImport target="enhancement_components" onConfirm={onConfirm} onClose={() => {}} />);
  const input = screen.getByTestId("screenshot-input");
  fireEvent.change(input, { target: { files: [new File(["x"], "shot.png", { type: "image/png" })] } });
  await screen.findByText("Review values");
  return onConfirm;
}
const total = () => screen.getByText("Total Enhancement XP").nextSibling!.textContent;

describe("TEST C — live recalculation from review values", () => {
  it("OCR says 23 (please verify, 53 offered); correcting to 53 moves the total 595,320 → 598,320", async () => {
    suggestion100 = { value: 23, confidence: 0.6, alternates: [53] };
    const onConfirm = await openReview();
    const f100 = screen.getByLabelText("100 XP components") as HTMLInputElement;
    expect(f100.value).toBe("23");
    expect(screen.getAllByText(/Please verify/).length).toBeGreaterThan(0);
    expect(total()).toBe("595,320");
    expect(screen.getByText("23 × 100 =", { exact: false })).toBeTruthy();

    fireEvent.change(f100, { target: { value: "53" } }); // user edits
    expect(total()).toBe("598,320");
    expect(screen.getByText("53 × 100 =", { exact: false })).toBeTruthy();

    fireEvent.click(screen.getByText("I've checked these values against my game."));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & use values" }));
    expect(onConfirm).toHaveBeenCalledWith({ xp10: 59_302, xp100: 53 }, "enhancement_components");
  });

  it("LOW confidence: 23 is NOT filled in; the user picks from [23] [53]; picking 53 → 598,320", async () => {
    suggestion100 = { value: 23, confidence: 0.4, alternates: [53] };
    await openReview();
    const f100 = screen.getByLabelText("100 XP components") as HTMLInputElement;
    expect(f100.value).toBe("");
    expect(screen.getAllByText(/Uncertain/).length).toBeGreaterThan(0);
    expect(total()).toBe("593,020"); // only the confirmed 10 XP tile counts so far
    fireEvent.click(screen.getByRole("button", { name: "Use 53" }));
    await waitFor(() => expect(f100.value).toBe("53"));
    expect(total()).toBe("598,320");
  });

  it("shows the source tile crop next to each value", async () => {
    suggestion100 = { value: 53, confidence: 0.95, alternates: [] };
    await openReview();
    expect(screen.getByRole("img", { name: /100 XP components tile/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /10 XP components tile/ })).toBeTruthy();
    expect(screen.getAllByText("Detected").length).toBe(2);
  });
});
