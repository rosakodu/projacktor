import { FC, memo } from "react";
import { MediaShelf, MediaShelfProps } from "./MediaShelf";

export type ShelfProps = MediaShelfProps;
export const Shelf: FC<ShelfProps> = memo((props) => <MediaShelf {...props} />);
export default Shelf;
