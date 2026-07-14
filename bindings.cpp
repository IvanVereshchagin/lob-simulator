#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include "OrderBook.h"
#include "SantaFeFlow.h"

namespace py = pybind11;

PYBIND11_MODULE(orderbook_cpp, m) {
    py::enum_<Side>(m, "Side")
        .value("Buy", Side::Buy)
        .value("Sell", Side::Sell);

    py::class_<Order>(m, "Order")
        .def(py::init<Side, int, int, int>())
        .def_readwrite("side", &Order::side)
        .def_readwrite("price", &Order::price)
        .def_readwrite("volume", &Order::volume)
        .def_readwrite("id", &Order::id);

    py::class_<OrderBook>(m, "OrderBook")
        .def(py::init<>())
        .def("bestBid", &OrderBook::bestBid)
        .def("bestAsk", &OrderBook::bestAsk)
        .def("addLimitOrder", &OrderBook::addLimitOrder)
        .def("processOrder", &OrderBook::processOrder)
        .def("cancelOrder", &OrderBook::cancelOrder)
        .def("bidDepth", &OrderBook::bidDepth)
        .def("askDepth", &OrderBook::askDepth);
}