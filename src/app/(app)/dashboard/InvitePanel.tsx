"use client";

import { useState } from "react";
import { createInviteAction } from "@/lib/auth/actions";

export function InvitePanel() {
  const [link, setLink] = useState<string | null>(null);
  return (
    <div className="border border-black bg-[#E4E3E0] p-3">
      <div className="mb-2 text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono">
        邀请新用户
      </div>
      <button
        onClick={async () => {
          const token = await createInviteAction();
          setLink(`${location.origin}/register?invite=${token}`);
        }}
        className="bg-black px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800"
      >
        生成邀请链接
      </button>
      {link && (
        <div className="mt-2 break-all border border-black bg-white px-2 py-1 text-[10px] f-mono">
          {link}
        </div>
      )}
    </div>
  );
}
