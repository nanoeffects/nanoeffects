// The profile of a pokémon: what the server answers, and the command that builds it.
// This file imports no bus.
import { createAction } from "nanoeffects/actions";
import { profileHandler } from "./profile-handlers";
import type { Upstream } from "./upstream";

// The text of an ability, or null when its request failed or was too slow
export type ProfileAbility = { name: string; text: string | null };

export type Profile = {
	name: string;
	types: string[];
	abilities: ProfileAbility[];
};

// createProfile — makes the command that builds a profile. It carries its handler, which uses the
// upstream it is given, so a test hands in a fake.
export const createProfile = (upstream: Upstream) =>
	createAction("profile/load", profileHandler(upstream));
