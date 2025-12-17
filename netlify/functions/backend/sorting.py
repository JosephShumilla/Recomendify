import heapq
import pandas as pd

# Defines comparator for sorting algorithms
def comparator(a, b):
    similarity_a = a['similarity']
    similarity_b = b['similarity']
    
    # Compares similarity scores
    return similarity_a > similarity_b

# Defines the merge aspect of the mergeSort algorithm
def merge(dataSet, l, m, r):
    # Defines size of each half
    n1 = m - l + 1
    n2 = r - m

    # Initializes left and right lists
    L = [0] * n1
    R = [0] * n2

    # Fills each half of the lists
    for i in range(n1):
        L[i] = dataSet[l + i]

    for j in range(n2):
        R[j] = dataSet[m + 1 + j]

    i = j = 0
    k = l

    # Merges lists using custom comparator
    while i < n1 and j < n2:
        if comparator(L[i], R[j]):
            dataSet[k] = L[i]
            i += 1
        else:
            dataSet[k] = R[j]
            j += 1
        k += 1
    # Appends any left over elements
    while i < n1:
        dataSet[k] = L[i]
        i += 1
        k += 1

    while j < n2:
        dataSet[k] = R[j]
        j += 1
        k += 1

# Defines mergeSortHelper so mergeSort does not have more than 1 parameter
def mergeSortHelper(dataSet, l, r):
    if l < r:
        m = l + (r - l) // 2
        # Recursively calls mergeSort on each half
        mergeSortHelper(dataSet, l, m)
        mergeSortHelper(dataSet, m + 1, r)
        merge(dataSet, l, m, r)

# Defines mergeSort that simply calls the mergeSortHelper
def mergeSort(dataSet):
    mergeSortHelper(dataSet, 0, len(dataSet) - 1)

# Defines the heapSort algorithm
def heapSort(dataSet):
    # Gets the n-largest elements from the dataset using the heapq library with lambda function that will use similarity as comparison
    sortedData = list(heapq.nlargest(len(dataSet), dataSet, 
                                     key=lambda x: (x['similarity'], x['track_id'])))
    return sortedData
