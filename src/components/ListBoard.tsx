"use client";

import { requiredPrice, formatMoney } from "@/lib/pricing";
import type { Board, Spot } from "@/lib/types";

interface Props {
  spotList: Spot[];
  board: Board;
  onPick: (spotId: string) => void;
}

export default function ListBoard({ spotList, board, onPick }: Props) {
  const sorted = [...spotList].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return (
    <div className="listboard">
      {sorted.map((s) => (
        <div className="rankrow" key={s.id}>
          <span className="pos tnum">#{s.position}</span>
          {s.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="logo" src={s.logo_url} alt="" />
          ) : (
            <span className="logo" />
          )}
          <span>
            <div className="label">{s.owner_display ?? "Unclaimed"}</div>
            <div className="holder">
              {s.owner_display && s.link_url ? (
                <a href={s.link_url} target="_blank" rel="noopener noreferrer nofollow">
                  {new URL(s.link_url).host}
                </a>
              ) : (
                s.label
              )}
            </div>
          </span>
          <span className="price tnum">
            {formatMoney(requiredPrice(s, Number(board.multiplier)), board.currency)}
          </span>
          <button className="btn primary" onClick={() => onPick(s.id)}>
            {s.owner_display ? "Conquer" : "Claim"}
          </button>
        </div>
      ))}
    </div>
  );
}
