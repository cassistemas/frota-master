// pagination.js

// Pagination functionality for all modules

class Pagination {
    constructor(totalRecords, pageSize = 25) {
        this.totalRecords = totalRecords;
        this.pageSize = pageSize;
        this.currentPage = 1;
        this.totalPages = Math.ceil(totalRecords / pageSize);
    }

    // Navigate to a specific page
    goToPage(page) {
        if (page < 1 || page > this.totalPages) return;
        this.currentPage = page;
        this.render();
    }

    // Go to the next page
    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.render();
        }
    }

    // Go to the previous page
    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.render();
        }
    }

    // Render pagination buttons
    render() {
        let paginationHtml = '';

        // Previous button
        if (this.currentPage > 1) {
            paginationHtml += `<button onclick='pagination.prevPage()'>Previous</button>`;
        }

        // Numeric buttons
        for (let i = 1; i <= this.totalPages; i++) {
            if (i === this.currentPage) {
                paginationHtml += `<strong>${i}</strong>`;
            } else {
                paginationHtml += `<button onclick='pagination.goToPage(${i})'>${i}</button>`;
            }
        }

        // Next button
        if (this.currentPage < this.totalPages) {
            paginationHtml += `<button onclick='pagination.nextPage()'>Next</button>`;
        }

        document.getElementById('pagination').innerHTML = paginationHtml;
    }
}

// Usage
// Assuming totalRecords is defined elsewhere
// let pagination = new Pagination(totalRecords);
// pagination.render();