#!/bin/bash

# Number of parallel requests to make
NUM_REQUESTS=${1:-5}

# Record the start time of the entire process
total_start_time=$(date +%s.%N)

# Function to make a single curl request
make_request() {
    local id=$1
    echo "Starting request #$id"
    
    # Record start time of this request
    local start_time=$(date +%s.%N)
    
    curl --location 'http://localhost:3000/upload' \
        --form 'media=@"/home/aneesh/Downloads/heidi/test_pdf/SmallFile.pdf"' \
        --form 'media=@"/home/aneesh/Downloads/heidi/test_pdf/Large-pdf.pdf"'
    
    # Record end time and calculate duration
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc)
    
    echo "Completed request #$id in $duration seconds"
    
    # Store execution time in temporary file
    echo "$duration" > "/tmp/request_time_$id"
}

echo "Launching $NUM_REQUESTS parallel requests..."

# Launch requests in parallel
for ((i=1; i<=$NUM_REQUESTS; i++)); do
    make_request $i &
done

# Wait for all background processes to complete
wait

# Record the end time of the entire process
total_end_time=$(date +%s.%N)
total_duration=$(echo "$total_end_time - $total_start_time" | bc)

echo "All requests completed"
echo "Total execution time: $total_duration seconds"

# Print times for first and second requests
if [ -f "/tmp/request_time_1" ]; then
    echo "Request #1 execution time: $(cat /tmp/request_time_1) seconds"
    rm "/tmp/request_time_1"
fi

if [ -f "/tmp/request_time_2" ]; then
    echo "Request #2 execution time: $(cat /tmp/request_time_2) seconds"
    rm "/tmp/request_time_2"
fi

# Cleanup any remaining temp files
for ((i=3; i<=$NUM_REQUESTS; i++)); do
    [ -f "/tmp/request_time_$i" ] && rm "/tmp/request_time_$i"
done