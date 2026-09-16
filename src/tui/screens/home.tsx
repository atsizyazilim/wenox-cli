import { Box } from "ink";
import { Logo } from "../components/logo.js";

export function Home({ height }: { height: number }) {
  return (
    <Box height={height} flexDirection="column" justifyContent="center" alignItems="center">
      <Logo />
    </Box>
  );
}
