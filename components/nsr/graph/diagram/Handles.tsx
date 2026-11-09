"use client";
// Eight quiet handles, as EntityNode has (brief 28): an arrow leaves or enters any side; toFlow picks the pair by direction.
import { Fragment } from "react";
import { Handle, Position } from "@xyflow/react";

export function Handles() {
  return (
    <>
      {([["t", Position.Top], ["b", Position.Bottom], ["l", Position.Left], ["r", Position.Right]] as const).map(([id, p]) => (
        <Fragment key={id}>
          <Handle type="source" id={id} position={p} className="!h-1 !w-1 !border-0 !bg-transparent" />
          <Handle type="target" id={`${id}t`} position={p} className="!h-1 !w-1 !border-0 !bg-transparent" />
        </Fragment>
      ))}
    </>
  );
}
