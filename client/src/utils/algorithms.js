/**
 * Algorithm helpers used by the inventory, sales, purchase, search, and report
 * screens. Authentication and password hashing are handled by the backend.
 */

export function mergeSort(arr, compareFn) {
  if (arr.length <= 1) return arr;

  const mid = Math.floor(arr.length / 2);
  const left = mergeSort(arr.slice(0, mid), compareFn);
  const right = mergeSort(arr.slice(mid), compareFn);

  return merge(left, right, compareFn);
}

function merge(left, right, compareFn) {
  const result = [];
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (compareFn(left[leftIndex], right[rightIndex]) <= 0) {
      result.push(left[leftIndex]);
      leftIndex += 1;
    } else {
      result.push(right[rightIndex]);
      rightIndex += 1;
    }
  }

  return result.concat(left.slice(leftIndex), right.slice(rightIndex));
}

export function binarySearch(arr, target, compareFn) {
  let left = 0;
  let right = arr.length - 1;

  while (left <= right) {
    const mid = Math.floor(left + (right - left) / 2);
    const comparison = compareFn(arr[mid], target);

    if (comparison === 0) return mid;
    if (comparison < 0) left = mid + 1;
    else right = mid - 1;
  }

  return -1;
}

export function binarySearchByPrefix(arr, prefix, getKey) {
  if (arr.length === 0 || !prefix) return [];

  const lowerPrefix = prefix.toLowerCase();
  let left = 0;
  let right = arr.length - 1;
  let firstMatch = -1;

  while (left <= right) {
    const mid = Math.floor(left + (right - left) / 2);
    const key = getKey(arr[mid]).toLowerCase();

    if (key.startsWith(lowerPrefix)) {
      firstMatch = mid;
      right = mid - 1;
    } else if (key < lowerPrefix) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  if (firstMatch === -1) return [];

  const results = [];
  for (let index = firstMatch; index < arr.length; index += 1) {
    if (!getKey(arr[index]).toLowerCase().startsWith(lowerPrefix)) break;
    results.push(arr[index]);
  }

  return results;
}

export function linearSearch(arr, predicate) {
  for (let index = 0; index < arr.length; index += 1) {
    if (predicate(arr[index])) return arr[index];
  }

  return undefined;
}

export function linearSearchAll(arr, predicate) {
  const results = [];

  for (let index = 0; index < arr.length; index += 1) {
    if (predicate(arr[index])) results.push(arr[index]);
  }

  return results;
}

export function linearSearchWithIndex(arr, predicate) {
  for (let index = 0; index < arr.length; index += 1) {
    if (predicate(arr[index])) {
      return { item: arr[index], index };
    }
  }

  return null;
}

export function sortByNameAsc(items) {
  return mergeSort(items, (a, b) => a.name.localeCompare(b.name));
}

export function sortByNameDesc(items) {
  return mergeSort(items, (a, b) => b.name.localeCompare(a.name));
}

export function sortByQuantityAsc(items) {
  return mergeSort(items, (a, b) => a.quantity - b.quantity);
}

export function sortByQuantityDesc(items) {
  return mergeSort(items, (a, b) => b.quantity - a.quantity);
}

export function sortByDateAsc(items) {
  return mergeSort(items, (a, b) => new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime());
}

export function sortByDateDesc(items) {
  return mergeSort(items, (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
}

export function sortByIdAsc(items) {
  return mergeSort(items, (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
}

export function sortByIdDesc(items) {
  return mergeSort(items, (a, b) => String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
}
