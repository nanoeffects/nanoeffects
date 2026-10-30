import {
	createAction,
	createSlice,
	type PayloadAction,
} from "@reduxjs/toolkit";

export type CounterState = { count: number; error: string };

const initialState: CounterState = { count: 0, error: "" };

// createSlice — RTK: the state and the reducers of the counter, and the actions of the reducers
const counterSlice = createSlice({
	name: "counter",
	initialState,
	reducers: {
		incremented(state) {
			state.count += 1;
			state.error = "";
		},
		failed(state, action: PayloadAction<string>) {
			state.error = action.payload;
		},
	},
});

export const { incremented, failed } = counterSlice.actions;
export const counterReducer = counterSlice.reducer;

// createAction — RTK: the requests of the buttons. No reducer listens to them; the bus does.
export const incrementLaterRequested = createAction(
	"counter/incrementLaterRequested",
);
export const incrementCancelled = createAction("counter/incrementCancelled");
export const incrementFlakyRequested = createAction(
	"counter/incrementFlakyRequested",
);
export const incrementBrokenRequested = createAction(
	"counter/incrementBrokenRequested",
);
