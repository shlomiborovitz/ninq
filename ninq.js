'use strict';

const NO_ELEMENT = {};

// Privates
const _iteratee = Symbol('iteratee'),
	_iterator = Symbol('iterator'),
	_key = Symbol('key'),
	_elementAt = Symbol('elementAt');

let l = function ninq(obj) {
	return !isIterable(obj) || isWrapper(obj)
		? obj
		: new Enumerable(obj);
};

function* concatIterator(left, right) {
	for (let item of left) {
		yield item;
	}
	for (let item of right) {
		yield item;
	}
}
function distinctEqIterator(enumerabe) {
	return new Set(enumerabe);
}
function distinctCmpIterator(enumerable, comparer) {
	let previousItems = [];
	function hadNotReturnedPredicate(item) {
		let result = previousItems.every(prevItem => !comparer(prevItem, item));
		if (result) {
			previousItems.push(item);
		}
		return result;
	}
	return enumerable.where(hadNotReturnedPredicate);
}

function* empty() {
}
function* asIterable(item) {
	yield item;
}
function equalityComparer(left, right) {
	return left === right;
}
function invisibleFilter() {
	return true;
}
function exceptEq(left, right) {
	let set = new Set(right);
	return left.where(item => !set.has(item));
}
function exceptCmp(left, right, comparer) {
	return left.where(item => !right.contains(item, comparer));
}
function groupByEq(source, keySelector, elementSelector, resultSelector) {
	elementSelector = elementSelector || (element => element);
	resultSelector = resultSelector || ((key, elements) => new Grouping(key, elements));
	let mapped = new source.toLookup(keySelector, elementSelector);
	return mapped;
}
function groupByCmp(source, keySelector, elementSelector, resultSelector, comparer) {
	let existingKeys = [];
	let itemsByKey = new Map();
	for (let item of source) {
		let key = keySelector(item);
		let element = elementSelector(item);
		let keyPredicate = existKey => comparer(existKey, key);
		if (l(existingKeys).any(keyPredicate)) {
			key = l(existingKeys).first(keyPredicate);
			itemsByKey.get(key).push(element);
		}
		else {
			existingKeys.push(key);
			itemsByKey.set(key, [element]);
		}
	}
	return itemsByKey;
}
function* groupJoinEq(outer, inner, outerKeySelector, innerKeySelector, resultSelector) {
	let mappedInner = inner.toLookup(innerKeySelector);
	for (let item of outer) {
		let key = outerKeySelector(item);
		let matchedInnerItems = mappedInner.has(key)
			? l(mappedInner.get(key))
			: Enumerable.empty();
		yield resultSelector(item, matchedInnerItems);
	}
}
function* groupJoinCmp(outer, inner, outerKeySelector, innerKeySelector, resultSelector, comparer) {
	let existingKeys = [];
	let mappedInner = inner.aggregate((map, item) => {
		let key = innerKeySelector(item);
		if (existingKeys.some(existingKey => comparer(existingKey, key))) {
			key = l(existingKeys).first()
			map.get(key).push(item);
		}
		else {
			existingKeys.push(key);
			map.set(key, [item])
		}
		return map;
	}, new Map());
	for (let item of outer) {
		let key = outerKeySelector(item);
		let matchedInnerItems = mappedInner.has(key)
			? l(mappedInner.get(key))
			: Enumerable.empty();
		yield resultSelector(item, matchedInnerItems);
	}
}

class Enumerable {
	constructor(iteratee, iterator) {
		this[_iteratee] = iteratee;
		if (!iterator) {
			iterator = iteratee[Symbol.iterator];
		}
		this[_iterator] = iterator.bind(iterator);
	}
	[Symbol.iterator]() {
		return this[_iterator]();
	}
	get length() {
		// If itertee is not an Enumerable wrapper, and has a length property - it would be returned
		// Otherwise, this.count()
		return !(this[_iteratee] instanceof Enumerable) && (typeof this[_iteratee].length === 'number')
			? this[_iteratee].length
			: this.count();
	}
	aggregate(callback, init) {
		let iterator = this[Symbol.iterator]();
		if (arguments.length < 2) {
			let iteration = iterator.next();
			if (iteration.done) {
				throw Error('Cannot aggregate empty collection');
			}
			else {
				init = iteration.value;
			}
		}
		for (let iteration = iterator.next(); !iteration.done; iteration = iterator.next()) {
			init = callback(init, iteration.value);
		}
		return init;
	}
	reduce(callback, init) {
		return this.aggregate(callback, init);
	}
	all(callback) {
		let result = true;
		let index = 0;
		for (let item of this) {
			result = !!callback(item, index);
			if (!result) {
				break;
			}
			index++;
		}
		return result;
	}
	every(callback) {
		return this.all(callback);
	}
	any(callback) {
		return typeof callback === 'function'
			? !this.all((item, index) => !callback(item, index))
			: !this.isEmpty();
	}
	isEmpty() {
		var result = true;
		for (let item of this) {
			result = true;
			break;
		}
		return result;
	}
	some(callback) {
		return this.any(callback);
	}
	concat(other) {
		return new Enumerable(this, concatIterator(this, other));
	}
	contains(item, comparer) {
		if (typeof comparer !== 'function') {
			comparer = equalityComparer;
		}
		let result = false;
		for (let element of this) {
			result = comparer(element, item);
			if (result) {
				break;
			}
		}
		return result;
	}
	includes(item, comparer) {
		return this.contains(item, comparer);
	}
	count(predicate) {
		if (typeof predicate !== 'function') {
			predicate = invisibleFilter;
		}
		let count = 0;
		for (let item in this.where(predicate)) {
			count++;
		}
		return count;
	}
	defaultIfEmpty(defaultValue) {
		return this.isEmpty()
			? new Enumerable(asIterable(defaultValue))
			: this;
	}
	distinct(comparer) {
		return typeof comparer === 'function'
			? distinctCmpIterator(this, comparer)
			: distinctEqIterator(this);
	}
	[_elementAt](index) {
		let result = NO_ELEMENT;
		for (let element of this.select((item, index) => ({ item, index }))) {
			if (element.index === index) {
				result = element.item;
				break;
			}
		}
		return result;
	}
	elementAt(index) {
		let result = this[_elementAt](index);
		if (result === NO_ELEMENT) {
			throw new Error(`No element at ${index}`);
		}
		return result;
	}
	elementAtOrDefault(index, defaultValue) {
		let result = this[_elementAt](index);
		return result === NO_ELEMENT
			? defaultValue
			: result;
	}
	except(other, comparer) {
		return typeof comparer !== 'function'
			? exceptEq(this, other)
			: exceptCmp(this, other, comparer);
	}
	first(pedicate) {
		return this.elementAt(0);
	}
	firstOrDefualt(predicate, defaultValue) {
		return this.elementAtOrDefault(0, defaultValue);
	}
	groupBy(keySelector, elementSelector, resultSelector, comparer) {
		let mapped = typeof comparer === 'function'
			? groupByEq(this, keySelector, elementSelector, resultSelector, comparer)
			: groupByCmp(this, keySelector, elementSelector, resultSelector);
		return l(mapped).map(entry => resultSelector(entry[0], entry[1]));
	}
	groupJoin(inner, outerKeySelector, innerKeySelector, resultSelector, comparer) {
		let resultIterator = typeof comparer === 'function'
		? groupJoinCmp
		:groupJoinEq;
		return new Enumerable(
			this, 
			resultIterator.bind(
				null, 
				this, 
				inner, 
				outerKeySelector, 
				innerKeySelector,
				resultSelector, 
				comparer));
	}
	static empty() {
		return new Enumerable(empty());
	}
}

class Grouping extends Enumerable {
	constructor(key, itratee, iterator) {
		super(itratee, iterator);
		this[_key] = key;
	}
	get key() {
		return this[_key];
	}
}

function isIterable(obj) {
	return ['object', 'function'].some(type => type === typeof obj) &&
		typeof obj[Symbol.iterator] === 'function';
};

function isWrapper(obj) {
	return obj instanceof Enumerable;
}

l.isIterable = isIterable;
l.isWrapper = isWrapper;

module.exports = l;