import { configureStore } from "@reduxjs/toolkit";
import { createEffectsMiddleware } from "nanoeffects/redux";
import { bus } from "./bus";
import { counterReducer } from "./slice";

// createEffectsMiddleware — actions reach the bus after the reducers, and tasks get ctx.store
const middleware = createEffectsMiddleware(bus);

// configureStore — RTK
export const store = configureStore({
	reducer: { counter: counterReducer },
	middleware: (getDefaultMiddleware) =>
		getDefaultMiddleware().concat(middleware),
});
