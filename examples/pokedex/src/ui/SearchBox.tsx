import { useState } from "react";
import { useStore } from "zustand";
import { findPokemon, pickRandom } from "../entities/pokemon/pokemon";
import { pokemonIndexStore } from "../entities/pokemon-index/pokemon-index-store";
import {
	clearSuggestions,
	queryTyped,
} from "../features/suggest-pokemon/suggest";
import { suggestStore } from "../features/suggest-pokemon/suggest-store";
import { bus } from "../shared/bus";

export function SearchBox() {
	const [text, setText] = useState("");
	// the suggestion that the arrow keys point at; -1 is none
	const [highlighted, setHighlighted] = useState(-1);
	const { items } = useStore(suggestStore);
	const { failed } = useStore(pokemonIndexStore);

	function search(value: string) {
		if (value.trim() !== "") {
			// bus.emit — start the search job; the pokemon entity waits for quiet and aborts the older one
			bus.emit(findPokemon(value));
		}
		close();
	}

	function close() {
		// bus.emit with a command — the suggest-pokemon feature closes its list
		bus.emit(clearSuggestions());
		setHighlighted(-1);
	}

	function choose(name: string) {
		setText(name);
		search(name);
	}

	function handleInput(value: string) {
		setText(value);
		setHighlighted(-1);
		// bus.emit — tell the bus the text changed; the feature turns it into suggestions
		bus.emit(queryTyped(value));
	}

	function handleKey(key: string) {
		if (key === "ArrowDown" && items.length > 0) {
			setHighlighted((index) => (index + 1) % items.length);
		} else if (key === "ArrowUp" && items.length > 0) {
			setHighlighted((index) => (index <= 0 ? items.length - 1 : index - 1));
		} else if (key === "Enter") {
			choose(items[highlighted] ?? text);
		} else if (key === "Escape") {
			close();
		}
	}

	return (
		<>
			<div className="row">
				<span className="combo">
					<input
						role="combobox"
						aria-expanded={items.length > 0}
						aria-controls="suggestions"
						aria-activedescendant={
							highlighted >= 0 ? `suggestion-${highlighted}` : void 0
						}
						placeholder="A name or a number (pikachu, 25)"
						autoComplete="off"
						value={text}
						onChange={(event) => handleInput(event.target.value)}
						onKeyDown={(event) => {
							if (
								["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)
							) {
								event.preventDefault();
								handleKey(event.key);
							}
						}}
					/>
					{items.length > 0 && (
						<div className="options" id="suggestions" role="listbox">
							{items.map((name, index) => (
								<div
									key={name}
									className="option"
									role="option"
									tabIndex={-1}
									id={`suggestion-${index}`}
									aria-selected={index === highlighted}
									// onMouseDown — choose before the input loses focus and closes the list
									onMouseDown={(event) => {
										event.preventDefault();
										choose(name);
									}}
								>
									{name}
								</div>
							))}
						</div>
					)}
				</span>{" "}
				{/* bus.emit — the pokemon entity drops a second click while the first search runs */}
				<button type="button" onClick={() => bus.emit(pickRandom())}>
					Random
				</button>
			</div>
			{failed && (
				<p className="hint">
					No suggestions: the list of names did not load. Type a name or a
					number and press Enter.
				</p>
			)}
		</>
	);
}
