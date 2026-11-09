// The diagram parts (brief 28), registered with React Flow by GraphPage beside its EntityNode ("entity"), which draws
// a diagram's cards (shape "rect") as it draws every other card.
import { AxisArrows } from "./AxisArrows";
import { BandLayer } from "./BandLayer";
import { DiagramEdge } from "./DiagramEdge";
import { DiscNode } from "./DiscNode";
import { LabelNode } from "./LabelNode";
import { LegendBox } from "./LegendBox";
import { LevelNode } from "./LevelNode";
import { SquareNode } from "./SquareNode";

export const DIAGRAM_NODE_TYPES = {
  disc: DiscNode,
  square: SquareNode,
  level: LevelNode,
  label: LabelNode,
  band: BandLayer,
  legend: LegendBox,
  axis: AxisArrows,
};
export const DIAGRAM_EDGE_TYPES = { diagram: DiagramEdge };
export { AxisArrows, BandLayer, DiagramEdge, DiscNode, LabelNode, LegendBox, LevelNode, SquareNode };
