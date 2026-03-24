const ctx = document.getElementById("chart");

const data = {
  labels: [],
  datasets: [{
    label: "Hours",
    data: []
  }]
};

new Chart(ctx, {
  type: "bar",
  data: data,
  options: {
    responsive: true
  }
});
