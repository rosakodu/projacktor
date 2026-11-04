import { FC, memo } from "react";
import { MediaShelf, MediaShelfProps } from "./MediaShelf";

export type SectorShelfProps = MediaShelfProps;
export const SectorShelf: FC<SectorShelfProps> = memo((props) => <MediaShelf {...props} />);
export default SectorShelf;
