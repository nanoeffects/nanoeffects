// Fixture: the top layer may import any layer below it.
import { second } from "../entities/second/second";
import { two } from "../features/two/two";
import { shared } from "../shared/shared";

export const screen = [shared, second, two].join(" ");
