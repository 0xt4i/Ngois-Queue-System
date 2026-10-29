"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer className="h-5 w-5" /> In trang này (khổ A5)
    </Button>
  );
}
