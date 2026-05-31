import configuration from "../../content-collections.ts";
import { GetTypeByName } from "@content-collections/core";

export type Hurricanepage = GetTypeByName<typeof configuration, "hurricanepages">;
export declare const allHurricanepages: Array<Hurricanepage>;

export {};
