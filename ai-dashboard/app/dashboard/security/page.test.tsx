import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SecurityDashboard from "./page";

describe("SecurityDashboard", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("shows loading state before data arrives", () => {
    (global.fetch as unknown as Mock).mockReturnValue(new Promise(() => {}));
    render(<SecurityDashboard />);
    expect(screen.getByText("불러오는 중...")).toBeInTheDocument();
  });

  it("renders CloudTrail events and VPC flow log lines once loaded", async () => {
    (global.fetch as unknown as Mock).mockResolvedValue({
      json: async () => ({
        cloudtrailEvents: [
          {
            eventTime: "2026-08-14T08:00:43Z",
            eventName: "AssumeRole",
            eventSource: "sts.amazonaws.com",
            userIdentity: { arn: "arn:aws:sts::123:x" },
          },
        ],
        vpcflowLines: ["2 970307871446 eni-abc - - - - - - - 1786691700 1786691761 - NODATA"],
      }),
    });

    render(<SecurityDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/AssumeRole/)).toBeInTheDocument();
    });
    expect(screen.getByText(/eni-abc/)).toBeInTheDocument();
  });
});
