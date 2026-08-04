import { clientConfig } from "@library/shared/config";
import { zClientConfigSchema } from "@library/shared/types/config";

import { publicProcedure, router } from "../index";

export const configAppRouter = router({
  clientConfig: publicProcedure
    .output(zClientConfigSchema)
    .query(() => clientConfig),
});
