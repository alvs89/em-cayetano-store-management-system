/**
 * ═══════════════════════════════════════════════════════════════════
 * ALGORITHMS UTILITY MODULE
 * E.M. Cayetano Trading - Inventory Management System
 * ═══════════════════════════════════════════════════════════════════
 * 
 * This module contains core algorithms used throughout the application:
 * 1. Merge Sort - For efficient sorting of inventory data
 * 2. Binary Search - For fast searching in sorted data
 * 3. Linear Search - For sequential searching in unsorted data
 * 4. Bcrypt - For secure password hashing (via bcryptjs)
 */

import bcrypt from 'bcryptjs';

// ═══════════════════════════════════════════════════════════════════
// 1. MERGE SORT ALGORITHM
// ═══════════════════════════════════════════════════════════════════
// Time Complexity: O(n log n)
// Space Complexity: O(n)
// Used for: Sorting inventory items, user accounts, and reports
// ═══════════════════════════════════════════════════════════════════

/**
 * Generic merge sort implementation that works with any data type
 * @param arr - Array to be sorted
 * @param compareFn - Comparison function to determine sort order
 * @returns Sorted array
 */
export function mergeSort(arr, compareFn) {
  // Base case: arrays with 0 or 1 element are already sorted
  if (arr.length <= 1) {
    return arr;
  }

  // Divide: Split array into two halves
  const mid = Math.floor(arr.length / 2);
  const left = arr.slice(0, mid);
  const right = arr.slice(mid);

  // Conquer: Recursively sort both halves
  const sortedLeft = mergeSort(left, compareFn);
  const sortedRight = mergeSort(right, compareFn);

  // Combine: Merge the sorted halves
  return merge(sortedLeft, sortedRight, compareFn);
}

/**
 * Helper function to merge two sorted arrays
 * @param left - First sorted array
 * @param right - Second sorted array
 * @param compareFn - Comparison function
 * @returns Merged and sorted array
 */
function merge(left, right, compareFn) {
  const result = [];
  let leftIndex = 0;
  let rightIndex = 0;

  // Compare elements from left and right arrays and merge in sorted order
  while (leftIndex < left.length && rightIndex < right.length) {
    if (compareFn(left[leftIndex], right[rightIndex]) <= 0) {
      result.push(left[leftIndex]);
      leftIndex++;
    } else {
      result.push(right[rightIndex]);
      rightIndex++;
    }
  }

  // Add remaining elements from left array (if any)
  while (leftIndex < left.length) {
    result.push(left[leftIndex]);
    leftIndex++;
  }

  // Add remaining elements from right array (if any)
  while (rightIndex < right.length) {
    result.push(right[rightIndex]);
    rightIndex++;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// 2. BINARY SEARCH ALGORITHM
// ═══════════════════════════════════════════════════════════════════
// Time Complexity: O(log n)
// Space Complexity: O(1)
// Used for: Fast searching in sorted inventory lists
// NOTE: Array must be sorted before using binary search
// ═══════════════════════════════════════════════════════════════════

/**
 * Binary search implementation for finding an item in a sorted array
 * @param arr - Sorted array to search in
 * @param target - Target value to find
 * @param compareFn - Function to compare items with target
 * @returns Index of found item, or -1 if not found
 */
export function binarySearch(arr, target, compareFn) {
  let left = 0;
  let right = arr.length - 1;

  // Continue searching while the search space is valid
  while (left <= right) {
    // Find middle index (avoiding overflow)
    const mid = Math.floor(left + (right - left) / 2);
    const comparison = compareFn(arr[mid], target);
    if (comparison === 0) {
      // Found the target
      return mid;
    } else if (comparison < 0) {
      // Target is in the right half
      left = mid + 1;
    } else {
      // Target is in the left half
      right = mid - 1;
    }
  }

  // Target not found
  return -1;
}

/**
 * Binary search to find all items matching a prefix (e.g., searching by partial ID or name)
 * @param arr - Sorted array to search in
 * @param prefix - Prefix to match
 * @param getKey - Function to extract the search key from an item
 * @returns Array of all matching items
 */
export function binarySearchByPrefix(arr, prefix, getKey) {
  if (arr.length === 0 || !prefix) return [];
  const lowerPrefix = prefix.toLowerCase();
  const results = [];

  // Find the first item that could match the prefix
  let left = 0;
  let right = arr.length - 1;
  let firstMatch = -1;
  while (left <= right) {
    const mid = Math.floor(left + (right - left) / 2);
    const key = getKey(arr[mid]).toLowerCase();
    if (key.startsWith(lowerPrefix)) {
      firstMatch = mid;
      right = mid - 1; // Continue searching for earlier matches
    } else if (key < lowerPrefix) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  // If no match found, return empty array
  if (firstMatch === -1) return [];

  // Collect all consecutive items that match the prefix
  let index = firstMatch;
  while (index < arr.length && getKey(arr[index]).toLowerCase().startsWith(lowerPrefix)) {
    results.push(arr[index]);
    index++;
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════
// 3. LINEAR SEARCH ALGORITHM
// ═══════════════════════════════════════════════════════════════════
// Time Complexity: O(n)
// Space Complexity: O(1)
// Used for: Searching unsorted data, filtering by multiple criteria
// ═══════════════════════════════════════════════════════════════════

/**
 * Linear search implementation for finding an item in an array
 * @param arr - Array to search in (can be unsorted)
 * @param predicate - Function that returns true when item is found
 * @returns Found item or undefined
 */
export function linearSearch(arr, predicate) {
  // Iterate through each item sequentially
  for (let i = 0; i < arr.length; i++) {
    if (predicate(arr[i])) {
      // Found the item that matches the predicate
      return arr[i];
    }
  }

  // Item not found
  return undefined;
}

/**
 * Linear search to find all items matching a predicate
 * @param arr - Array to search in (can be unsorted)
 * @param predicate - Function that returns true for items to include
 * @returns Array of all matching items
 */
export function linearSearchAll(arr, predicate) {
  const results = [];

  // Iterate through each item and collect matches
  for (let i = 0; i < arr.length; i++) {
    if (predicate(arr[i])) {
      results.push(arr[i]);
    }
  }
  return results;
}

/**
 * Linear search with index tracking
 * @param arr - Array to search in
 * @param predicate - Function that returns true when item is found
 * @returns Object with found item and its index, or null
 */
export function linearSearchWithIndex(arr, predicate) {
  for (let i = 0; i < arr.length; i++) {
    if (predicate(arr[i])) {
      return {
        item: arr[i],
        index: i
      };
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// 4. BCRYPT PASSWORD HASHING
// ═══════════════════════════════════════════════════════════════════
// Used for: Secure password storage and authentication
// Implements: Bcrypt algorithm via bcryptjs library
// ═══════════════════════════════════════════════════════════════════

// Number of salt rounds for bcrypt (higher = more secure but slower)
// 10 rounds is a good balance between security and performance
const SALT_ROUNDS = 10;

/**
 * Hash a password using bcrypt
 * @param password - Plain text password to hash
 * @returns Promise that resolves to hashed password
 */
export async function hashPassword(password) {
  try {
    // Generate salt and hash password in one step
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    return hashedPassword;
  } catch (error) {
    console.error('Error hashing password:', error);
    throw new Error('Failed to hash password');
  }
}

/**
 * Verify a password against a hash
 * @param password - Plain text password to verify
 * @param hash - Hashed password to compare against
 * @returns Promise that resolves to true if password matches, false otherwise
 */
export async function verifyPassword(password, hash) {
  try {
    // Compare plain password with hashed password
    const isMatch = await bcrypt.compare(password, hash);
    return isMatch;
  } catch (error) {
    console.error('Error verifying password:', error);
    return false;
  }
}

/**
 * Generate a bcrypt hash synchronously (for initial data setup)
 * @param password - Plain text password to hash
 * @returns Hashed password
 */
export function hashPasswordSync(password) {
  try {
    const salt = bcrypt.genSaltSync(SALT_ROUNDS);
    const hashedPassword = bcrypt.hashSync(password, salt);
    return hashedPassword;
  } catch (error) {
    console.error('Error hashing password (sync):', error);
    throw new Error('Failed to hash password');
  }
}

/**
 * Verify a password against a hash synchronously
 * @param password - Plain text password to verify
 * @param hash - Hashed password to compare against
 * @returns True if password matches, false otherwise
 */
export function verifyPasswordSync(password, hash) {
  try {
    return bcrypt.compareSync(password, hash);
  } catch (error) {
    console.error('Error verifying password (sync):', error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS FOR COMMON SORTING OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Sort items by name (A-Z)
 */
export function sortByNameAsc(items) {
  return mergeSort(items, (a, b) => a.name.localeCompare(b.name));
}

/**
 * Sort items by name (Z-A)
 */
export function sortByNameDesc(items) {
  return mergeSort(items, (a, b) => b.name.localeCompare(a.name));
}

/**
 * Sort items by quantity (Low to High)
 */
export function sortByQuantityAsc(items) {
  return mergeSort(items, (a, b) => a.quantity - b.quantity);
}

/**
 * Sort items by quantity (High to Low)
 */
export function sortByQuantityDesc(items) {
  return mergeSort(items, (a, b) => b.quantity - a.quantity);
}

/**
 * Sort items by date (Oldest first)
 */
export function sortByDateAsc(items) {
  return mergeSort(items, (a, b) => {
    return new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime();
  });
}

/**
 * Sort items by date (Newest first)
 */
export function sortByDateDesc(items) {
  return mergeSort(items, (a, b) => {
    return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
  });
}

/**
 * Sort items by ID (A-Z)
 */
export function sortByIdAsc(items) {
  return mergeSort(items, (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
}

/**
 * Sort items by ID (Z-A)
 */
export function sortByIdDesc(items) {
  return mergeSort(items, (a, b) => String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
}
